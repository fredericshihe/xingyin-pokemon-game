import React from 'react'
import GameCanvas from './GameCanvas'

// Panels suspend the existing scene. Only changing map identity (the parent's key)
// or leaving the game should dispose its WebGL context and first-frame readiness.
export default function MapSceneLayer({ active = true, ...props }) {
  return (
    <div className="map-scene-retained" aria-hidden={!active} style={{ display: active ? 'flex' : 'none', flex: '1 1 0%', minHeight: 0, flexDirection: 'column' }}>
      <GameCanvas {...props} mapActive={active} />
    </div>
  )
}
