import React, { memo, useEffect, useState } from 'react'
import { BATTLE_TEXT_CHAR_MS } from '../../utils/battlePacing'

// Keep per-letter updates out of the battle scene, its HUD and material renderer.
export default memo(function BattleDialogueTypewriter({ text = '' }) {
  const [length, setLength] = useState(0)
  useEffect(() => {
    let frame = 0, started = null, previous = -1
    setLength(0)
    const tick = now => {
      started ??= now
      const next = Math.min(text.length, Math.floor((now - started) / BATTLE_TEXT_CHAR_MS))
      if (next !== previous) { previous = next; setLength(next) }
      if (next < text.length) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [text])
  return <>{text.slice(0, length) || '\u00a0'}</>
})
