import React from 'react'
import './mapWarpFade.css'

export const MAP_WARP_FADE_OUT_MS = 180
export const MAP_WARP_FADE_IN_MS = 200
export const MAP_WARP_SCENE_TIMEOUT_MS = 12000

// Keep loading fully black until the destination has rendered its first frame.
// Both the preview and the saved game use the same timing and appearance.
export default function MapWarpFade({ transit, onRevealComplete }) {
  if (!transit) return null
  return (
    <div
      key={transit.id}
      className={`map-warp-fade map-warp-fade--${transit.phase}`}
      data-phase={transit.phase}
      onAnimationEnd={event => {
        if (event.animationName === 'map-warp-reveal' && transit.phase === 'arriving') onRevealComplete?.(transit)
      }}
      style={{ '--warp-fade-out': `${MAP_WARP_FADE_OUT_MS}ms`, '--warp-fade-in': `${MAP_WARP_FADE_IN_MS}ms` }}
      role="status"
      aria-label="正在切换地图"
    />
  )
}
