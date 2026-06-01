import { loadGameStyles } from './loadGameStyles'
import { startEarlyEntryPreload } from './gameEntryPreload'

let primed = false

/** 登录后尽早预拉游戏 JS/CSS 与可并行的全量素材，缩短进游戏前的等待。 */
export function primeStudentSession() {
  if (primed || typeof window === 'undefined') return
  primed = true

  void loadGameStyles()
  void import('../components/Game/GameWrapper')
  void import('../game/threeLowPolyModelCache')
  void import('../game/ThreeLowPolyMap')
  void import('../game/threeLowPolyMap')

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => {
      void startEarlyEntryPreload().catch((error) => {
        console.warn('[prime] early asset preload skipped', error)
      })
    }, { timeout: 1200 })
  } else {
    window.setTimeout(() => {
      void startEarlyEntryPreload().catch((error) => {
        console.warn('[prime] early asset preload skipped', error)
      })
    }, 400)
  }
}
